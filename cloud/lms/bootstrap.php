<?php
require __DIR__.'/vendor/autoload.php';

use Illuminate\Container\Container;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\DateFactory;
use Illuminate\Support\Facades\Facade;

$container = new Container;
$container->instance('http', new Factory);
$container->instance('date', new DateFactory);
Facade::setFacadeApplication($container);
